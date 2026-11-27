import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    useRef,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { PageLoader } from './PageLoader';
import type { IdentityStatus } from '../../platform/identity/identity-types';
import {
    LOADER_HIDE_EVENT,
    LOADER_SHOW_EVENT,
    playPageEnter,
} from '../../app/navigation';
import { preloadSiteRoutePage } from '../../app/route-loaders';

/**
 * Upper bound for holding the loader while the session is still being restored.
 * After it, the Gate's own "Restoring secure session" state becomes visible, so
 * an unreachable API can never trap the visitor behind the loader.
 */
const IDENTITY_WAIT_CAP_MS = 8_000;

type PageLoadingContextValue = {
    finishPageLoading: () => void;
};

const PageLoadingContext = createContext<PageLoadingContextValue | null>(null);

export function PageLoadingProvider({
    children,
    waitForMazeEngine = false,
    identityStatus,
}: {
    children: ReactNode;
    waitForMazeEngine?: boolean;
    identityStatus?: IdentityStatus;
}) {
    const [loading, setLoading] = useState(true);
    const [identityWaitExpired, setIdentityWaitExpired] = useState(false);
    const finishingRef = useRef(false);

    const finishPageLoading = useCallback(() => {
        if (finishingRef.current) return;
        finishingRef.current = true;
        // Reveal the React page as soon as its critical bootstrap has completed.
        // Fonts, images and non-critical API data settle progressively in the background.
        setLoading(false);
        document.body.classList.remove('page-loading');
        document.body.classList.add('page-loaded');
        // Start any one-shot cross-document fallback only after the destination
        // content and the persistent frame have been released from the loader.
        void playPageEnter().catch((error) => {
            console.warn('[PageLoading] optional entrance transition failed:', error);
        });
    }, []);

    // Loader shown by soft page transitions, on top of the persistent background.
    useEffect(() => {
        const show = () => setLoading(true);
        const hide = () => setLoading(false);
        window.addEventListener(LOADER_SHOW_EVENT, show);
        window.addEventListener(LOADER_HIDE_EVENT, hide);
        return () => {
            window.removeEventListener(LOADER_SHOW_EVENT, show);
            window.removeEventListener(LOADER_HIDE_EVENT, hide);
        };
    }, []);

    // The loader is the only surface shown while the session is unknown, so a
    // signed-in visitor can never see the guest Gate during session restore.
    useEffect(() => {
        if (identityStatus !== 'checking') return undefined;
        const timer = window.setTimeout(() => setIdentityWaitExpired(true), IDENTITY_WAIT_CAP_MS);
        return () => window.clearTimeout(timer);
    }, [identityStatus]);

    useEffect(() => {
        const identityPending = identityStatus === 'checking' && !identityWaitExpired;

        if (waitForMazeEngine) {
            // Keep the initial document loader visible while the server session
            // is restored. Guests must see the access gate rather than an endless
            // loader; an initially authenticated session waits for engine-ready.
            if (identityPending || identityStatus === 'authenticating' || !identityStatus) return;
            if (identityStatus === 'authenticated') return;
            // anonymous, error, or a session check that exceeded the wait cap.
            finishPageLoading();
            return;
        }

        if (identityPending) return;

        let cancelled = false;
        const reveal = async () => {
            // A signed-in visitor's destination chunk is resolved before the loader
            // lifts, so the page never appears as an empty Suspense frame.
            if (identityStatus === 'authenticated') {
                try {
                    await preloadSiteRoutePage(window.location.pathname);
                } catch (preloadError) {
                    console.warn('[PageLoading] Could not prefetch the destination page:', preloadError);
                }
            }
            if (!cancelled) finishPageLoading();
        };
        const onLoad = () => { void reveal(); };

        if (document.readyState === 'complete') {
            onLoad();
        } else {
            window.addEventListener('load', onLoad, { once: true });
        }

        return () => {
            cancelled = true;
            window.removeEventListener('load', onLoad);
        };
    }, [waitForMazeEngine, identityStatus, identityWaitExpired, finishPageLoading]);

    return (
        <PageLoadingContext.Provider value={{ finishPageLoading }}>
            {children}
            {createPortal(
                <PageLoader visible={loading} />,
                document.body,
            )}
        </PageLoadingContext.Provider>
    );
}

export function usePageLoading() {
    const context = useContext(PageLoadingContext);

    if (!context) {
        throw new Error(
            'usePageLoading must be used inside PageLoadingProvider',
        );
    }

    return context.finishPageLoading;
}