# TODOs

## Notifications & Dock Attention

- Implement dock bounce (requestUserAttention) when sessions transition to idle/needs-input while window is unfocused. Code is commented out in `App.tsx`, `useNotchNotifications.ts`, `NotificationSettings.tsx`, `session.rs`, and `lib.rs`.
- Fix timing issue: transitions that happen while focused need to be queued and delivered when user switches away.
- Re-enable notification settings tab in SettingsPage once dock bounce is working.
- Consider native OS notifications and sound alerts as additional notification channels.

## Session Workspace Identity

- Consider persisting a richer workspace identity object instead of reconstructing roots from mixed session and history metadata.
- Consider loading persisted local sessions on app startup so live and historical session identity are less fragmented.
- Revisit a `Checks` inspector tab only after workspace identity is consistently trustworthy across files, changes, transcripts, and previews.
