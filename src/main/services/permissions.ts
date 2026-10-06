import { app, dialog, systemPreferences } from 'electron';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PermissionStatus {
  storage: boolean;
  camera: boolean;
  microphone: boolean;
  screen: boolean;
  accessibility: boolean;
  details?: Record<string, string>;
}

export type PermissionType = 'storage' | 'camera' | 'microphone' | 'screen' | 'accessibility';

export class PermissionService {
  /**
   * Check system permissions across macOS, Windows, and Linux.
   */
  async checkPermissions(): Promise<PermissionStatus> {
    const status: PermissionStatus = {
      storage: this.checkStoragePermission(),
      camera: await this.checkMediaPermission('camera'),
      microphone: await this.checkMediaPermission('microphone'),
      screen: await this.checkScreenPermission(),
      accessibility: this.checkAccessibilityPermission(),
      details: {},
    };

    status.details = {
      storage: status.storage ? 'granted' : 'denied',
      camera: status.camera ? 'granted' : 'denied',
      microphone: status.microphone ? 'granted' : 'denied',
      screen: status.screen ? 'granted' : 'denied',
      accessibility: status.accessibility ? 'granted' : 'denied',
    };

    return status;
  }

  /**
   * Request system permissions using OS native dialogs / system APIs.
   */
  async requestPermissions(types?: PermissionType[]): Promise<PermissionStatus> {
    const targets: PermissionType[] = types && types.length > 0
      ? types
      : ['storage', 'camera', 'microphone', 'screen', 'accessibility'];

    for (const type of targets) {
      if (type === 'storage') {
        await this.requestStoragePermission();
      } else if (type === 'camera') {
        await this.requestMediaPermission('camera');
      } else if (type === 'microphone') {
        await this.requestMediaPermission('microphone');
      } else if (type === 'screen') {
        await this.requestScreenPermission();
      } else if (type === 'accessibility') {
        this.requestAccessibilityPermission();
      }
    }

    return this.checkPermissions();
  }

  /**
   * Verify read/write storage permission in app userData directory.
   */
  private checkStoragePermission(): boolean {
    try {
      const userDataPath = app.getPath('userData');
      if (!existsSync(userDataPath)) {
        mkdirSync(userDataPath, { recursive: true });
      }
      const testFile = join(userDataPath, `.perm_test_${Date.now()}.tmp`);
      writeFileSync(testFile, 'test', 'utf-8');
      const content = readFileSync(testFile, 'utf-8');
      unlinkSync(testFile);
      return content === 'test';
    } catch {
      return false;
    }
  }

  private async requestStoragePermission(): Promise<boolean> {
    const hasAccess = this.checkStoragePermission();
    if (hasAccess) return true;

    // Show native system dialog prompt for storage permission
    const result = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Grant Storage Access', 'Cancel'],
      defaultId: 0,
      title: 'Storage Permission Required',
      message: 'Novi requires permission to access local storage.',
      detail: 'Novi needs read and write access to save your configuration, credentials, and app session state in your user folder.',
    });

    if (result.response === 0) {
      // Re-check after prompt
      try {
        const userDataPath = app.getPath('userData');
        mkdirSync(userDataPath, { recursive: true });
        return this.checkStoragePermission();
      } catch (err: any) {
        await dialog.showMessageBox({
          type: 'error',
          buttons: ['OK'],
          title: 'Storage Access Failed',
          message: 'Could not obtain storage write access.',
          detail: err?.message || 'Please check folder permissions or run Novi as an authorized user.',
        });
      }
    }
    return false;
  }

  private async checkMediaPermission(mediaType: 'camera' | 'microphone'): Promise<boolean> {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus(mediaType);
      return status === 'granted';
    }
    return true; // Windows & Linux default to true / managed via Chromium session permission handler
  }

  private async requestMediaPermission(mediaType: 'camera' | 'microphone'): Promise<boolean> {
    if (process.platform === 'darwin') {
      try {
        const granted = await systemPreferences.askForMediaAccess(mediaType);
        return granted;
      } catch {
        return false;
      }
    }
    return true;
  }

  private async checkScreenPermission(): Promise<boolean> {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('screen');
      return status === 'granted';
    }
    return true;
  }

  private async requestScreenPermission(): Promise<boolean> {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('screen');
      if (status !== 'granted') {
        // macOS prompts screen access system dialog when capturing screen or requesting desktop sources
        dialog.showMessageBox({
          type: 'info',
          buttons: ['OK'],
          title: 'Screen Recording Permission Required',
          message: 'Novi requires Screen Recording permission.',
          detail: 'Please enable Screen Recording for Novi in macOS System Settings > Privacy & Security > Screen & System Audio Recording.',
        }).catch(() => {});
      }
      return status === 'granted';
    }
    return true;
  }

  private checkAccessibilityPermission(): boolean {
    if (process.platform === 'darwin') {
      return systemPreferences.isTrustedAccessibilityClient(false);
    }
    return true;
  }

  private requestAccessibilityPermission(): boolean {
    if (process.platform === 'darwin') {
      // Passing true invokes macOS system prompt: "Novi would like to control this computer using accessibility features..."
      return systemPreferences.isTrustedAccessibilityClient(true);
    }
    return true;
  }
}
