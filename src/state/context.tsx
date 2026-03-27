import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { appReducer, initialState } from "./reducer";
import type { AppState, AppAction } from "./types";
import { projectCommands, settingsCommands } from "@/lib/tauri-commands";

const AppStateContext = createContext<AppState>(initialState);
const AppDispatchContext = createContext<Dispatch<AppAction>>(() => {});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    projectCommands
      .getPath()
      .then((path) => {
        dispatch({ type: "SET_PROJECT_PATH", path });
      })
      .catch((err) => {
        console.error("Failed to load project path:", err);
      });

    projectCommands
      .listPaths()
      .then((paths) => {
        dispatch({ type: "SET_PROJECTS", paths });
      })
      .catch((err) => {
        console.error("Failed to load project paths:", err);
      });

    settingsCommands
      .getGitHubToken()
      .then((token) => {
        dispatch({ type: "SET_GITHUB_TOKEN", token });
      })
      .catch((err) => {
        console.error("Failed to load GitHub token:", err);
      });
  }, []);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppStateContext);
}

export function useAppDispatch() {
  return useContext(AppDispatchContext);
}
