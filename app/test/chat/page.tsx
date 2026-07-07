import ChatMessage from "@/components/ChatMessage";
import { Input } from "@/components/ui/input";


export default function Test_Chat() {
    return (
        <>
            <div className="w-60 h-50 border-2 overflow-auto">
                <>
                    <ChatMessage
                        imageUrl={"/static/images.png"}
                        time={new Date().toISOString()}
                        nickname={"123"}
                        body={"zxczcxzzzxczcxzzzxczcxzzzxczcxzzzxczcxzzzxczcxzz"}
                    />

                    <ChatMessage
                        imageUrl={"/static/images.png"}
                        time={new Date().toISOString()}
                        nickname={"123"}
                        body={"zxczcxzz"}
                    />

                    <ChatMessage
                        imageUrl={"/static/images.png"}
                        time={new Date().toISOString()}
                        nickname={"123"}
                        body={"zxczcxzz"}
                    />

                    <ChatMessage
                        imageUrl={"/static/images.png"}
                        time={new Date().toISOString()}
                        nickname={"123"}
                        body={"zxczcxzz"}
                    />

                </>
            </div>
            <div>
                <Input type="text" placeholder="Enter text..." />
            </div>
        </>
    );
}