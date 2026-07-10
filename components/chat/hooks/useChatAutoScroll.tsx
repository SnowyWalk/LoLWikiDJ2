"use client";

import {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";

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
    const previousMessageCount = useRef(messages.length);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        const scrollDiv = scrollDivRef.current;
        if (scrollDiv == null)
            return;

        const handleScroll = () => {
            const isAtBottom =
                scrollDiv.scrollHeight - scrollDiv.scrollTop - scrollDiv.clientHeight <= 8;

            shouldStickToBottom.current = isAtBottom;
            if (isAtBottom)
                setUnreadCount(0);
        };

        scrollDiv.addEventListener("scroll", handleScroll);
        return () => scrollDiv.removeEventListener("scroll", handleScroll);
    }, [scrollDivRef]);

    const scrollToBottom = useCallback(() => {
        const scrollDiv = scrollDivRef.current;
        if (scrollDiv == null)
            return;

        scrollDiv.scrollTop = scrollDiv.scrollHeight;
        shouldStickToBottom.current = true;
        setUnreadCount(0);
    }, [scrollDivRef]);

    useLayoutEffect(() => {
        const wasScrollRequested = scrollRequest !== previousScrollRequest.current;
        const addedMessageCount = messages.length - previousMessageCount.current;

        if (wasScrollRequested || (addedMessageCount > 0 && shouldStickToBottom.current))
            scrollToBottom();
        else if (addedMessageCount > 0)
            setUnreadCount((count) => count + addedMessageCount);

        previousScrollRequest.current = scrollRequest;
        previousMessageCount.current = messages.length;
    }, [messages, scrollRequest, scrollToBottom]);

    return {unreadCount, scrollToBottom};
};

export default useChatAutoScroll;
