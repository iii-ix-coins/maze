
type PageLoaderProps = {
  visible: boolean;
};

export function PageLoader({ visible }: PageLoaderProps) {
  return (
    <div
      className={`page-loader${visible ? '' : ' is-hidden'}`}
      role="status"
      aria-label="Loading"
      aria-hidden={!visible}
    >
      <img
        className="page-loader__logo"
        src="/css/images/maze-logo.svg"
        alt=""
        draggable={false}
      />
    </div>
  );
}
