import asyncio
import atexit
import concurrent.futures

_processPool = None


async def runInSubProcess(func, *args):
    global _processPool

    if _processPool is None:
        _processPool = concurrent.futures.ProcessPoolExecutor()

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_processPool, func, *args)


def shutdownProcessPool():
    global _processPool

    if _processPool is not None:
        _processPool.shutdown(wait=False)
        _processPool = None


atexit.register(shutdownProcessPool)
