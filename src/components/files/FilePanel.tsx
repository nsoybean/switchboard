import { FileTree } from "./FileTree";
import { useAppState, useAppDispatch } from "../../state/context";

interface FilePanelProps {
  rootPath: string;
}

export function FilePanel({ rootPath }: FilePanelProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <FileTree
          rootPath={rootPath}
          selectedPath={state.previewFilePath}
          onFileSelect={(path) =>
            dispatch({ type: "SET_PREVIEW_FILE", path })
          }
        />
      </div>
    </div>
  );
}
