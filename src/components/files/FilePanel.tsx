import { FileTree } from "./FileTree";

interface FilePanelProps {
  rootPath: string;
}

export function FilePanel({ rootPath }: FilePanelProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <FileTree rootPath={rootPath} />
      </div>
    </div>
  );
}
