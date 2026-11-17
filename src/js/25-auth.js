/* ===== Authentication ===== */
const Auth = {
  session: null,

  currentUserId() { return this.session ? this.session.userId : null; },
  currentUser() { return this.session ? U.byId(Store.state.users, this.session.userId) : null; },
  currentEmployee() {
    const u = this.currentUser();
    if (!u || !u.employeeId) return null;
    return U.byId(Store.state.employees, u.employeeId);
  },

  login(username, password) {
    const un = String(username || '').trim().toLowerCase();
    const user = Store.state.users.find(u => u.username.toLowerCase() === un);
    if (!user) return { ok: false, error: 'loginFailed' };
    if (user.status !== 'active') return { ok: false, error: 'userDisabled' };
    if (!Passwords.verify(password, user.salt, user.passHash)) return { ok: false, error: 'loginFailed' };
    user.lastLogin = U.nowISO();
    this.session = { userId: user.id, loginAt: U.nowISO() };
    try { localStorage.setItem(LS_SESSION, JSON.stringify(this.session)); } catch (e) {}
    Store.audit('login', 'user:' + user.id);
    Store.persist(false);
    return { ok: true, user };
  },

  restoreSession() {
    try {
      const raw = localStorage.getItem(LS_SESSION);
      if (!raw) return false;
      const s = JSON.parse(raw);
      const user = U.byId(Store.state.users, s.userId);
      if (!user || user.status !== 'active') return false;
      this.session = s;
      return true;
    } catch (e) { return false; }
  },

  logout() {
    const u = this.currentUser();
    if (u) Store.audit('logout', 'user:' + u.id);
    this.session = null;
    try { localStorage.removeItem(LS_SESSION); } catch (e) {}
    Store.persist(false);
  },

  changePassword(user, currentPw, newPw) {
    if (!Passwords.verify(currentPw, user.salt, user.passHash)) return { ok: false, error: 'loginFailed' };
    if (!newPw || newPw.length < 6) return { ok: false, error: 'passwordTooShort' };
    const { salt, hash } = Passwords.make(newPw);
    Store.audit('changePassword', 'user:' + user.id);
    user.salt = salt; user.passHash = hash;
    Store.markDirty();
    return { ok: true };
  },

  adminResetPassword(targetUser, newPw) {
    if (!Perms.can('users', 'edit', targetUser)) throw new Error('permDenied');
    if (!newPw || newPw.length < 6) return { ok: false, error: 'passwordTooShort' };
    const { salt, hash } = Passwords.make(newPw);
    Store.audit('resetPassword', 'user:' + targetUser.id, '***', '***');
    targetUser.salt = salt; targetUser.passHash = hash;
    Store.markDirty();
    return { ok: true };
  }
};
