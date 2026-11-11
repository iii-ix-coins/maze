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
import {
    LOADER_HIDE_EVENT,
    LOADER_SHOW_EVENT,
    playPageEnter,
} from '../../app/navigation';
import { waitForPageReadiness } from '../../app/page-readiness';

type PageLoadingContextValue = {
    finishPageLoading: () => void;
};

const PageLoadingContext = createContext<PageLoadingContextValue | null>(null);

export function PageLoadingProvider({
    children,
    waitForMazeEngine = false,
}: {
    children: ReactNode;
    waitForMazeEngine?: boolean;
}) {
    const [loading, setLoading] = useState(true);
    const finishingRef = useRef(false);

    const finishPageLoading = useCallback(() => {
        if (finishingRef.current) return;
        finishingRef.current = true;
        void (async () => {
            await waitForPageReadiness();
            // Start the enter animation before removing the initial loading class.
            void playPageEnter();
            setLoading(false);
            document.body.classList.remove('page-loading');
            document.body.classList.add('page-loaded');
        })();
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
        // Maze signals readiness after its engine has initialized.
        if (waitForMazeEngine) return;

        const onLoad = () => finishPageLoading();

        if (document.readyState === 'complete') {
            onLoad();
        } else {
            window.addEventListener('load', onLoad, { once: true });
        }

        return () => {
            window.removeEventListener('load', onLoad);
        };
    }, [waitForMazeEngine, finishPageLoading]);

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