// Point d'entrée Cloudflare Pages Functions : toutes les requêtes /api/* arrivent ici.
import { handle } from "../../server/router.js";

export const onRequest = (context) => handle(context.request, context.env);
