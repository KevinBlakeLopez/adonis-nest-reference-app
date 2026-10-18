declare module 'connect-pg-simple' {
  function connectPgSimple(
    sessionModule: object,
  ): new (options?: {
    conString?: string;
    createTableIfMissing?: boolean;
  }) => object;

  export default connectPgSimple;
}
