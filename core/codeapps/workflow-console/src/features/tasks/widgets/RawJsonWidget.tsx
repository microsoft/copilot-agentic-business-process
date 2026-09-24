import type { BpWidgetProps } from '@/features/tasks/widgets/registry'

/** Default renderer: shows the task payload verbatim when no widget is registered for it. */
export function RawJsonWidget({ inputData, rawInputData, parseError }: BpWidgetProps) {
  return (
    <div className="space-y-3">
      {parseError && (
        <div className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">
          Could not parse <code className="font-mono">faf001_inputdata</code>: {parseError}
        </div>
      )}

      {inputData === undefined && !rawInputData ? (
        <p className="text-sm text-muted-foreground">This task carries no input data.</p>
      ) : (
        <pre className="max-h-[28rem] overflow-auto rounded-md bg-muted p-4 text-xs">
          {inputData !== undefined ? JSON.stringify(inputData, null, 2) : rawInputData}
        </pre>
      )}
    </div>
  )
}
