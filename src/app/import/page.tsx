import ImportForm from "./ImportForm";

export default function ImportPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import a Spectora template</h1>
        <p className="text-neutral-500 mt-1">
          Upload a Spectora &quot;Export HTML Text&quot; spreadsheet. We parse it, show you exactly
          what will be imported and flag anything we could not map, and only write to the
          database once you confirm.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
