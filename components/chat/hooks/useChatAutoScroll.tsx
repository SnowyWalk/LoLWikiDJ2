"use client";

import {useCallback, useEffect, useLayoutEffect, useRef} from "react";

type useChatAutoScrollProps<T> = {
    scrollDivRef: React.RefObject<HTMLDivElement | null>;
    messages: T[];
    scrollRequest: number;
}

const useChatAutoScroll = <T, >({
    scrollDivRef,
    messages,
    scrollRequest,
}: useChatAutoScrollProps<T>) => {
    const shouldStickToBottom = useRef(true);
    const previousScrollRequest = useRef(scrollRequest);

    useEffect(() => {
        if (scrollDivRef.current == null)
            return;

        const handleScroll = () => {
            shouldStickToBottom.current = scrollDivRef.current!.scrollHeight - scrollDivRef.current!.scrollTop - scrollDivRef.current!.clientHeight <= 8;
        }
        
        scrollDivRef.current.addEventListener("scroll", handleScroll);
        return () => scrollDivRef!.current?.removeEventListener("scroll", handleScroll)
    }, [scrollDivRef]);

    const scrollToBottom = useCallback(() => {
        const scrollDiv = scrollDivRef.current;
        if (scrollDiv == null)
            return;

        scrollDiv.scrollTop = scrollDiv.scrollHeight;
        shouldStickToBottom.current = true;
    }, [scrollDivRef]);

    useLayoutEffect(() => {
        const wasScrollRequested = scrollRequest !== previousScrollRequest.current;

        if (wasScrollRequested || shouldStickToBottom.current)
            scrollToBottom();

        previousScrollRequest.current = scrollRequest;
    }, [messages, scrollRequest, scrollToBottom]);

};

export default useChatAutoScroll;
