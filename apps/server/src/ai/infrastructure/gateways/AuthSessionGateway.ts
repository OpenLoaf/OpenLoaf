import type { AuthGateway, AuthSessionSnapshot } from "@/ai/application/ports/AuthGateway";
import { getAuthSessionSnapshot } from "@/modules/auth/tokenStore";

export class AuthSessionGateway implements AuthGateway {
  /** Read the current auth session snapshot. */
  getAuthSessionSnapshot(): AuthSessionSnapshot {
    return getAuthSessionSnapshot();
  }
}
