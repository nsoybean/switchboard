import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";

interface AvailableUpdate {
  version: string;
  date?: string;
  body?: string;
}

async function closeUpdateResource(update: Update | null) {
  if (!update) {
    return;
  }

  try {
    await update.close();
  } catch (error) {
    console.warn("Failed to close updater resource:", error);
  }
}

export function useAppUpdater() {
  const updateRef = useRef<Update | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(
    null,
  );
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [contentLength, setContentLength] = useState<number | null>(null);

  const replacePendingUpdate = async (nextUpdate: Update | null) => {
    const previous = updateRef.current;
    updateRef.current = nextUpdate;
    await closeUpdateResource(previous);
    setAvailableUpdate(
      nextUpdate
        ? {
            version: nextUpdate.version,
            date: nextUpdate.date,
            body: nextUpdate.body,
          }
        : null,
    );
  };

  const checkForUpdates = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (checkingForUpdates || installingUpdate) {
      return false;
    }

    setCheckingForUpdates(true);

    try {
      const update = await check();
      await replacePendingUpdate(update);

      if (update) {
        if (!silent) {
          toast.success(`Switchboard ${update.version} is ready to install`, {
            description: "The update button is now available in the titlebar.",
          });
        }
        return true;
      }

      if (!silent) {
        toast.success(
          currentVersion
            ? `You're up to date on Switchboard ${currentVersion}`
            : "You're already on the latest version",
        );
      }
      return false;
    } catch (error) {
      if (!silent) {
        toast.error("Failed to check for updates", {
          description: String(error),
        });
      }
      return false;
    } finally {
      setCheckingForUpdates(false);
    }
  };

  const installUpdate = async () => {
    const pendingUpdate = updateRef.current;
    if (!pendingUpdate || installingUpdate) {
      return;
    }

    setInstallingUpdate(true);
    setDownloadedBytes(0);
    setContentLength(null);

    try {
      await pendingUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setContentLength(event.data.contentLength ?? null);
            setDownloadedBytes(0);
            break;
          case "Progress":
            setDownloadedBytes((current) => current + event.data.chunkLength);
            break;
          case "Finished":
            break;
        }
      });

      toast.success("Update installed", {
        description: "Switchboard will restart to finish applying the update.",
      });
      await replacePendingUpdate(null);
      await relaunch();
    } catch (error) {
      toast.error("Failed to install update", {
        description: String(error),
      });
    } finally {
      setInstallingUpdate(false);
      setDownloadedBytes(0);
      setContentLength(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    void getVersion()
      .then((version) => {
        if (!cancelled) {
          setCurrentVersion(version);
        }
      })
      .catch((error) => {
        console.warn("Failed to load app version:", error);
      });

    void checkForUpdates({ silent: true });

    return () => {
      cancelled = true;
      void closeUpdateResource(updateRef.current);
      updateRef.current = null;
    };
  }, []);

  const updateProgress =
    contentLength && contentLength > 0
      ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100))
      : null;

  return {
    currentVersion,
    availableUpdate,
    checkingForUpdates,
    installingUpdate,
    updateProgress,
    checkForUpdates,
    installUpdate,
  };
}
