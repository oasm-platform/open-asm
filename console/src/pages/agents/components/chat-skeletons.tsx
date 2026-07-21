import { Skeleton } from '@/components/ui/skeleton';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// UserMessageSkeleton
// ---------------------------------------------------------------------------

function UserMessageSkeleton() {
  return (
    <Message from="user">
      <MessageContent>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </MessageContent>
    </Message>
  );
}

// ---------------------------------------------------------------------------
// AssistantMessageSkeleton
// ---------------------------------------------------------------------------

function AssistantMessageSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Message from="assistant">
        <MessageContent>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-[75%]" />
            <Skeleton className="h-4 w-[60%]" />
          </div>
        </MessageContent>
      </Message>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// LoadingSkeleton
// ---------------------------------------------------------------------------

export function LoadingSkeleton() {
  return (
    <motion.div
      className="flex flex-col gap-6"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.12 } },
      }}
    >
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 8 },
          visible: { opacity: 1, y: 0 },
        }}
        transition={{ duration: 0.3 }}
      >
        <UserMessageSkeleton />
      </motion.div>
      <AssistantMessageSkeleton delay={0.12} />
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 8 },
          visible: { opacity: 1, y: 0 },
        }}
        transition={{ duration: 0.3 }}
      >
        <UserMessageSkeleton />
      </motion.div>
      <AssistantMessageSkeleton delay={0.36} />
    </motion.div>
  );
}
