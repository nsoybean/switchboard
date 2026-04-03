import type { AppState, AppAction } from "./types";

export const initialState: AppState = {
  sessions: {},
  sessionsLoaded: false,
  activeSessionId: null,
  gitPanelOpen: false,
  projectPath: null,
  projects: [],
  previewFilePath: null,
  githubToken: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "HYDRATE_SESSIONS": {
      return {
        ...state,
        sessions: action.sessions,
        sessionsLoaded: true,
        activeSessionId: action.activeSessionId ?? state.activeSessionId,
      };
    }

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
            ? (ids[ids.length - 1] ?? null)
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

    case "SET_SESSION_BRANCH": {
      const session = state.sessions[action.id];
      if (!session) return state;
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.id]: {
            ...session,
            branch: action.branch,
            workspace: {
              ...session.workspace,
              branchName: action.branch,
              headKind: action.branch ? "branch" : "unknown",
            },
          },
        },
      };
    }

    case "SET_RESUME_TARGET": {
      const session = state.sessions[action.id];
      if (!session) return state;
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.id]: { ...session, resumeTargetId: action.resumeTargetId },
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

    case "SET_PROJECTS": {
      return {
        ...state,
        projects: action.paths,
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
