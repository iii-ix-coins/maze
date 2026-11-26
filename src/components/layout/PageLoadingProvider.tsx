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

type PageLoadingContextValue = {
    finishPageLoading: () => void;
};

const PageLoadingContext = createContext<PageLoadingContextValue | null>(null);

export function PageLoadingProvider({
    children,
    waitForMazeEngine = false,
    mazeIdentityStatus,
}: {
    children: ReactNode;
    waitForMazeEngine?: boolean;
    mazeIdentityStatus?: IdentityStatus;
}) {
    const [loading, setLoading] = useState(true);
    const finishingRef = useRef(false);

    const finishPageLoading = useCallback(() => {
        if (finishingRef.current) return;
        finishingRef.current = true;
        // Reveal the React page as soon as its critical bootstrap has completed.
        // Fonts, images and non-critical API data settle progressively in the background.
        void playPageEnter();
        setLoading(false);
        document.body.classList.remove('page-loading');
        document.body.classList.add('page-loaded');
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

    useEffect(() => {
        if (waitForMazeEngine) {
            // Keep the initial document loader visible while the server session
            // is restored. Guests must see the access gate rather than an endless
            // loader; an initially authenticated session waits for engine-ready.
            if (mazeIdentityStatus === 'checking' || mazeIdentityStatus === 'authenticating' || !mazeIdentityStatus) return;
            if (mazeIdentityStatus === 'authenticated') {
                return;
            }
            if (mazeIdentityStatus === 'anonymous' || mazeIdentityStatus === 'error') {
                finishPageLoading();
            }
            return;
        }

        const onLoad = () => finishPageLoading();

        if (document.readyState === 'complete') {
            onLoad();
        } else {
            window.addEventListener('load', onLoad, { once: true });
        }

        return () => {
            window.removeEventListener('load', onLoad);
        };
    }, [waitForMazeEngine, mazeIdentityStatus, finishPageLoading]);

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