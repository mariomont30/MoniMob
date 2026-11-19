const publicRoutes = new Set(['welcome', 'login', 'register', 'forgot']);
const sharedRoutes = ['overview', 'profile', 'deleteAccount', 'more', 'bot', 'notifications'];
const roleRoutes = {
  student: new Set([...sharedRoutes, 'home', 'favorites', 'catalog', 'filters', 'details', 'confirm', 'agenda', 'notifications', 'materials', 'attendance']),
  monitor: new Set([...sharedRoutes, 'monitorDashboard', 'adjustments', 'manageSessions', 'createSession', 'details', 'participants', 'manageMaterials', 'createMaterial', 'academicLinks']),
  professor: new Set([...sharedRoutes, 'details', 'professorDashboard', 'approvals', 'reports', 'academicLinks', 'manageMaterials', 'createMaterial'])
};

export const homeForRole = role => role === 'monitor' ? 'monitorDashboard' : role === 'professor' ? 'professorDashboard' : 'home';
export const publicSession = () => ({ user: null, activeRole: null, route: 'welcome', history: [] });

function canOpen(state, route) {
  return publicRoutes.has(route) || Boolean(state.user && (route === 'roleAccess' || roleRoutes[state.activeRole]?.has(route)));
}

export function sessionNavigation(state, action) {
  switch (action.type) {
    case 'signedIn': {
      const user = action.user;
      const roles = user?.roles?.filter(role => roleRoutes[role]);
      if (!user?.id || !roles?.length) return publicSession();
      const selected = roles.includes(user.requestedRole) ? user.requestedRole : null;
      const activeRole = selected || roles[0];
      return { user: { ...user, roles }, activeRole, route: roles.length > 1 && !selected ? 'roleAccess' : homeForRole(activeRole), history: [] };
    }
    case 'signedOut': return publicSession();
    case 'go': return canOpen(state, action.route) ? { ...state, route: action.route, history: [...state.history, state.route] } : state;
    case 'back': {
      const history = [...state.history];
      let route;
      while (history.length && !route) { const candidate = history.pop(); if (canOpen(state, candidate)) route = candidate; }
      return { ...state, history, route: route || (state.user ? homeForRole(state.activeRole) : 'welcome') };
    }
    case 'chooseRole': return state.user?.roles.includes(action.role) && roleRoutes[action.role]
      ? { ...state, activeRole: action.role, route: homeForRole(action.role), history: [] } : state;
    case 'updateUser': return state.user && state.user.id === action.user?.id ? { ...state, user: { ...state.user, ...action.user } } : state;
    default: return state;
  }
}

export async function completeSignOut({ reset, signOut, recordEvent = async () => {} }) {
  reset();
  // A slow or unavailable server must not delay the local exit or the welcome screen.
  void Promise.resolve().then(recordEvent).catch(() => {});
  await signOut();
}
