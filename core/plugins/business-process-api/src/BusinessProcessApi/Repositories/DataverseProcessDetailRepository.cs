using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Faf001.BusinessProcessApi.Repositories
{
    public sealed class DataverseProcessDetailRepository
    {
        private readonly IOrganizationService service;

        public DataverseProcessDetailRepository(IOrganizationService service)
        {
            this.service = service ?? throw new ArgumentNullException(nameof(service));
        }

        public Entity GetProcess(Guid processId)
        {
            return service.Retrieve(DataverseProcessRepository.TableName, processId, new ColumnSet(
                "faf001_bpinstanceid", "faf001_processname", "faf001_processdescription", "faf001_processversion",
                "faf001_businesskey", "faf001_status", "faf001_statusmessage", "faf001_priority", "faf001_starttime",
                "faf001_endtime", "faf001_duedate", "faf001_lastupdated", "faf001_lastcompletedstepid",
                "faf001_errorcode", "faf001_errormessage", "faf001_channel", "faf001_initiatedby",
                "faf001_initiatorexternal", "ownerid", "createdon", "modifiedon", "statecode", "statuscode"));
        }

        public EntityCollection GetSteps(Guid processId)
        {
            return Related("faf001_bpstep", processId, new ColumnSet("faf001_bpstepid", "faf001_stepname",
                "faf001_bpinstanceid", "faf001_starttime", "faf001_endtime", "faf001_steptype", "faf001_status", "faf001_executedby", "createdon"));
        }

        public EntityCollection GetOutputs(Guid processId)
        {
            return Related("faf001_bpdatavalue", processId, new ColumnSet("faf001_bpdatavalueid", "faf001_datakey",
                "faf001_datatype", "faf001_description", "faf001_bpinstanceid", "faf001_bpstepid", "faf001_bptaskid",
                "ownerid", "createdon", "modifiedon", "statecode", "statuscode"));
        }

        public EntityCollection GetAttachments(Guid processId)
        {
            return Related("faf001_bpattachment", processId, new ColumnSet("faf001_bpattachmentid", "faf001_filename",
                "faf001_description", "faf001_attachmenttype", "faf001_bpinstanceid", "faf001_bpstepid", "faf001_bptaskid",
                "faf001_externalurl", "faf001_mimetype", "faf001_filesize", "faf001_storagetype", "faf001_source",
                "faf001_receivedon", "ownerid", "createdon", "modifiedon", "statecode", "statuscode"));
        }

        public EntityCollection GetArtifacts(Guid processId)
        {
            return Related("faf001_bpartifact", processId, new ColumnSet("faf001_bpartifactid", "faf001_artifactname",
                "faf001_description", "faf001_artifacttype", "faf001_version", "faf001_bpinstanceid", "faf001_bpstepid",
                "faf001_supersedesid", "faf001_externalurl", "faf001_mimetype", "faf001_filesize", "faf001_storagetype",
                "faf001_status", "faf001_generatedon", "faf001_generatedby", "ownerid", "createdon", "modifiedon", "statecode", "statuscode"));
        }

        private EntityCollection Related(string table, Guid processId, ColumnSet columns)
        {
            var query = new QueryExpression(table) { ColumnSet = columns };
            query.Criteria.AddCondition("faf001_bpinstanceid", ConditionOperator.Equal, processId);
            query.AddOrder("createdon", OrderType.Ascending);
            query.AddOrder(table + "id", OrderType.Ascending);
            return DataverseQuery.ReadAll(service, query);
        }
    }
}