import { handleModelOperations } from '../../../versions/moma_5.12.0_estack/server/api.js';

export const onRequest = ({ request, env }) => handleModelOperations(request, env);
