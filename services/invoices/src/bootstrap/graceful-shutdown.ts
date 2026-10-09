type ShutdownStep = () => Promise<unknown> | void;

const SHUTDOWN_TIMEOUT_MS = 10_000;

// Executa os passos em ordem no SIGTERM/SIGINT. Uma segunda chamada é
// ignorada e, se algum passo travar, o processo sai com código 1.
export function registerGracefulShutdown(
  serviceName: string,
  steps: ShutdownStep[],
) {
  let shuttingDown = false;

  async function shutdown(signal: NodeJS.Signals) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`[${serviceName}] ${signal} received, shutting down`);

    setTimeout(() => {
      console.error(`[${serviceName}] Forced shutdown`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    for (const step of steps) {
      await step();
    }

    process.exit(0);
  }

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
