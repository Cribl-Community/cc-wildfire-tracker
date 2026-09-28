// Globals the Cribl shell injects into the app iframe (see AGENTS.md). Read-only; never assign.
interface CriblUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  initials?: string;
}

interface Window {
  CRIBL_API_URL?: string;
  CRIBL_BASE_PATH?: string;
  CRIBL_APP_ID?: string;
  getCriblUser?: () => Promise<CriblUser>;
}
