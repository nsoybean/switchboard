import { FileTree } from "./FileTree";

interface FilePanelProps {
  rootPath: string;
  selectedPath?: string | null;
  onFileSelect?: (path: string) => void;
}

export function FilePanel({
  rootPath,
  selectedPath,
  onFileSelect,
}: FilePanelProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <FileTree
          rootPath={rootPath}
          selectedPath={selectedPath}
          onFileSelect={onFileSelect}
        />
      </div>
    </div>
  );
}
