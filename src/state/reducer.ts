import type { AppState, AppAction } from "./types";

export const initialState: AppState = {
  sessions: {},
  activeSessionId: null,
  gitPanelOpen: false,
  projectPath: null,
  viewMode: "focused",
  previewFilePath: null,
  githubToken: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_SESSION": {
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.session.id]: action.session,
        },
        activeSessionId: action.session.id,
      };
    }

    case "REMOVE_SESSION": {
      const { [action.id]: _, ...remaining } = state.sessions;
      const ids = Object.keys(remaining);
      return {
        ...state,
        sessions: remaining,
        activeSessionId:
          state.activeSessionId === action.id
            ? ids[ids.length - 1] ?? null
            : state.activeSessionId,
      };
    }

    case "SET_ACTIVE": {
      return {
        ...state,
        activeSessionId: action.id,
      };
    }

    case "RENAME_SESSION": {
      const session = state.sessions[action.id];
      if (!session) return state;
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.id]: { ...session, label: action.label },
        },
      };
    }

    case "UPDATE_STATUS": {
      const session = state.sessions[action.id];
      if (!session) return state;
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.id]: {
            ...session,
            status: action.status,
            exitCode: action.exitCode ?? session.exitCode,
          },
        },
      };
    }

    case "SET_PTY_ID": {
      const session = state.sessions[action.id];
      if (!session) return state;
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.id]: { ...session, ptyId: action.ptyId },
        },
      };
    }

    case "TOGGLE_GIT_PANEL": {
      return {
        ...state,
        gitPanelOpen: !state.gitPanelOpen,
      };
    }

    case "SET_PROJECT_PATH": {
      return {
        ...state,
        projectPath: action.path,
      };
    }

    case "SET_VIEW_MODE": {
      return {
        ...state,
        viewMode: action.mode,
      };
    }

    case "SET_PREVIEW_FILE": {
      return {
        ...state,
        previewFilePath: action.path,
      };
    }

    case "SET_GITHUB_TOKEN": {
      return {
        ...state,
        githubToken: action.token,
      };
    }

    default:
      return state;
  }
}
