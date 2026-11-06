// Type-only augmentation (erased at build): the legacy server stores the resolved client IP on the request object.
import 'http';
declare module 'http' {
    interface IncomingMessage { mazeClientIp?: string }
}
