
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { PageLoader } from './PageLoader';

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

    const finishPageLoading = useCallback(() => {
        setLoading(false);
        document.body.classList.remove('page-loading');
        document.body.classList.add('page-loaded');
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
