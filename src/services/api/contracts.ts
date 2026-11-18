export interface PublicConfigResponse {
  mintAddress: string;
}

export interface CoinAgeResponse {
  launchDate: string;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
}

/** Browser and Express consume one shared API route manifest. */
import apiRouteManifest from '../../../shared/api-routes.json';

export const API_PATHS = apiRouteManifest;
