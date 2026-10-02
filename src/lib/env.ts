import logo from '../assets/logo-sl.png'

/**
 * Trois façons de faire tourner l'application :
 * - « live » : le vrai CRM, publié sur claude.ai, données partagées entre les associés ;
 * - « apercu » : la démo publiée sur claude.ai (données fictives) ;
 * - sinon : la démo en local pendant le développement.
 */
const MODE = import.meta.env.VITE_MODE as string | undefined
/** Le CRM publié sur claude.ai (base de l'artifact, connecteurs claude.ai). */
export const ARTIFACT = MODE === 'live'
/** Le CRM hébergé sur GitHub Pages (base Firebase, connexion Google). */
export const CLOUD = !!import.meta.env.VITE_FIREBASE_API_KEY && !!import.meta.env.VITE_FIREBASE_PROJECT_ID
/** Données réelles et partagées, quel que soit l'hébergement. */
export const LIVE = ARTIFACT || CLOUD
/** Dans la visionneuse claude.ai : pas de barre d'adresse, pas d'impression, pas de boîtes de dialogue natives. */
export const HOSTED = ARTIFACT || MODE === 'apercu'
export const DEMO = !LIVE
export const LOGO = logo
