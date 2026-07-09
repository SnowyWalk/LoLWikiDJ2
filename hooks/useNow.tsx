export default function useNow(): { now: string } {
    const now = new Date().toISOString();
    return {now};
}