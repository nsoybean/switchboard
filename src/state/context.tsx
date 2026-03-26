import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { appReducer, initialState } from "./reducer";
import type { AppState, AppAction } from "./types";

const AppStateContext = createContext<AppState>(initialState);
const AppDispatchContext = createContext<Dispatch<AppAction>>(() => {});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    invoke<string | null>("get_project_path")
      .then((path) => {
        dispatch({ type: "SET_PROJECT_PATH", path });
      })
      .catch((err) => {
        console.error("Failed to load project path:", err);
      });

    invoke<string | null>("get_github_token")
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
