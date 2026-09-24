using System;
using System.Diagnostics;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Infrastructure.Execution
{
    public abstract class CustomApiPluginBase : IPlugin
    {
        private readonly string messageName;

        protected CustomApiPluginBase(string messageName)
        {
            this.messageName = messageName;
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null)
            {
                throw new ArgumentNullException(nameof(serviceProvider));
            }

            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var timer = Stopwatch.StartNew();
            var correlationId = Guid.Empty;
            try
            {
                var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
                if (context == null)
                {
                    throw new InvalidPluginExecutionException("Dataverse execution context is unavailable.");
                }

                correlationId = context.CorrelationId;
                if (!string.Equals(context.MessageName, messageName, StringComparison.OrdinalIgnoreCase)
                    || context.Stage != 30 || context.Mode != 0)
                {
                    throw new InvalidPluginExecutionException("Unsupported business-process-api operation or registration.");
                }
                if (context.UserId == Guid.Empty)
                {
                    throw new InvalidPluginExecutionException("A Dataverse execution user is required.");
                }

                tracing?.Trace("{0} started. CorrelationId={1}; IsInTransaction={2}",
                    messageName, correlationId, context.IsInTransaction);
                var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
                var service = factory.CreateOrganizationService(context.UserId);
                var execution = new ApiExecution(context, service, tracing);
                var outputs = ExecuteOperation(execution);
                foreach (var output in outputs)
                {
                    context.OutputParameters[output.Key] = output.Value;
                }
            }
            catch (InvalidPluginExecutionException)
            {
                tracing?.Trace("{0} rejected. CorrelationId={1}", messageName, correlationId);
                throw;
            }
            catch (FaultException<OrganizationServiceFault> exception)
            {
                tracing?.Trace("{0} failed. CorrelationId={1}; ErrorCode={2}",
                    messageName, correlationId, exception.Detail.ErrorCode);
                throw new InvalidPluginExecutionException(
                    "The business process operation failed. Verify your Dataverse permissions and retry. Correlation ID: " + correlationId,
                    exception);
            }
            catch (Exception exception)
            {
                tracing?.Trace("{0} failed. CorrelationId={1}; ExceptionType={2}",
                    messageName, correlationId, exception.GetType().FullName);
                throw new InvalidPluginExecutionException(
                    "An unexpected business process error occurred. Contact your administrator. Correlation ID: " + correlationId);
            }
            finally
            {
                tracing?.Trace("{0} finished. CorrelationId={1}; DurationMs={2}",
                    messageName, correlationId, timer.ElapsedMilliseconds);
            }
        }

        protected abstract ParameterCollection ExecuteOperation(ApiExecution execution);
    }

    public sealed class ApiExecution
    {
        internal ApiExecution(IPluginExecutionContext context, IOrganizationService organizationService, ITracingService tracing)
        {
            Context = context;
            OrganizationService = organizationService;
            Tracing = tracing;
        }

        public IPluginExecutionContext Context { get; }
        public IOrganizationService OrganizationService { get; }
        public ITracingService Tracing { get; }

        public Guid RequiredGuid(string name)
        {
            var value = OptionalValue<Guid>(name);
            if (!value.HasValue || value.Value == Guid.Empty)
                throw new InvalidPluginExecutionException(name + " must be a nonempty GUID.");
            return value.Value;
        }

        public T? OptionalValue<T>(string name) where T : struct
        {
            var value = Read(name);
            if (value == null) return null;
            if (value is T typed) return typed;
            throw new InvalidPluginExecutionException(name + " has an invalid type.");
        }

        public T? OptionalNonDefaultValue<T>(string name) where T : struct
        {
            var value = OptionalValue<T>(name);
            return value.HasValue && value.Value.Equals(default(T)) ? null : value;
        }

        public string OptionalString(string name)
        {
            var value = Read(name);
            if (value == null) return null;
            if (value is string text) return text;
            throw new InvalidPluginExecutionException(name + " must be a string.");
        }

        private object Read(string name)
        {
            return Context.InputParameters != null && Context.InputParameters.Contains(name)
                ? Context.InputParameters[name] : null;
        }
    }
}