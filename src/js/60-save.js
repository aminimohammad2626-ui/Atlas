/* ===== Embedded save system ===== */
const SaveSys = {
  fileHandle: null,
  autosaveTimer: null,
  templateHTML: null,

  captureTemplate() {
    this.templateHTML = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  },

  buildHTML() {
    let html = this.templateHTML;
    const data = JSON.stringify(Store.state).replace(/<\//g, '<\\/');
    html = this.replaceScript(html, 'atlas-embedded-data', data);
    const patchPayloads = JSON.stringify(Store.state.activePatchPayloads || {}).replace(/<\//g, '<\\/');
    html = this.replaceScript(html, 'atlas-embedded-patch', patchPayloads);
    return html;
  },

  replaceScript(html, id, content) {
    const re = new RegExp('(<script id="' + id + '" type="application\\/json">)([\\s\\S]*?)(<\\/script>)');
    if (!re.test(html)) throw new Error('embedded script ' + id + ' not found');
    return html.replace(re, (m, a, b, c) => a + content + c);
  },

  async save(options) {
    options = options || {};
    try {
      const html = this.buildHTML();
      let ok = false, method = null;
      if (this.fileHandle) {
        try {
          const perm = await this.fileHandle.queryPermission({ mode: 'readwrite' });
          if (perm === 'granted' || (await this.fileHandle.requestPermission({ mode: 'readwrite' })) === 'granted') {
            const w = await this.fileHandle.createWritable();
            await w.write(html);
            await w.close();
            ok = true; method = 'fs';
          } else {
            UI.toast(t('savePermissionDenied'), 'warn');
          }
        } catch (e) {
          console.warn('fs save failed', e);
        }
      }
      if (!ok && !options.preventDownload) {
        U.download('Atlas.html', html, 'text/html;charset=utf-8');
        ok = true; method = 'download';
      }
      if (ok) {
        Store.dirty = false;
        Store.lastSavedAt = U.nowISO();
        try { localStorage.setItem('atlas-lastsave', Store.lastSavedAt); } catch (e) {}
        try { localStorage.setItem(LS_KEY, JSON.stringify(Store.state)); } catch (e) {}
        Store.state.meta.lastPortableSave = Store.lastSavedAt;
        UI.updateSaveIndicator();
        if (!options.silent) UI.toast(t('saveSuccess') + ' (' + (method === 'fs' ? t('saveWithFs') : t('saveWithDownload')) + ')', 'success');
      }
      return ok;
    } catch (e) {
      console.error(e);
      UI.toast(t('saveFailed', { msg: e.message || e }), 'error');
      return false;
    }
  },

  scheduleAutosave() {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    const interval = U.clamp(U.num(Store.state.settings.autosaveInterval, 60), 15, 3600) * 1000;
    this.autosaveTimer = setTimeout(() => {
      Store.persist();
      UI.updateSaveIndicator();
    }, interval);
  },

  pickFile() {
    if (!window.showSaveFilePicker) return false;
    const self = this;
    window.showSaveFilePicker({
      suggestedName: 'Atlas.html',
      types: [{ description: 'Atlas application', accept: { 'text/html': ['.html'] } }]
    }).then(h => { self.fileHandle = h; self.save(); })
      .catch(e => { if (e && e.name !== 'AbortError') UI.toast(t('savePermissionDenied'), 'warn'); });
    return true;
  },

  hasFsAccess() { return !!window.showSaveFilePicker; }
};
