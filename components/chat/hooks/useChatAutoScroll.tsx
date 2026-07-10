"use client";

import {useCallback, useEffect, useLayoutEffect, useRef} from "react";

type useChatAutoScrollProps<T> = {
    scrollDivRef: React.RefObject<HTMLDivElement | null>;
    l: T[];
}

const useChatAutoScroll = <T, >({scrollDivRef, l}: useChatAutoScrollProps<T>) => {
    const shouldStickToBottom = useRef(true);

    useEffect(() => {
        if (scrollDivRef.current == null)
            return;

        scrollDivRef.current.onscroll = () => {
            const threshold = 8;

            shouldStickToBottom.current =
                scrollDivRef.current!.scrollHeight - scrollDivRef.current!.scrollTop - scrollDivRef.current!.clientHeight <= threshold;
        }
    }, [scrollDivRef]);

    const scrollToBottom = useCallback(() => {
        scrollDivRef.current!.scrollTop = scrollDivRef.current!.scrollHeight;
    }, [scrollDivRef]);

    useLayoutEffect(() => {
        if (shouldStickToBottom.current) {
            shouldStickToBottom.current = false;
            scrollToBottom();
        }
    }, [l, scrollToBottom]);

    return {scrollToBottom}
};

export default useChatAutoScroll;