export const fromNowMinutes = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    return Math.round(diffMs / 60000);
    };