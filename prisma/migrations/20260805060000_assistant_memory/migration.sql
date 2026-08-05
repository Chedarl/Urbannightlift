-- The assistant could not remember anything you had just said.
--
-- The sheet kept the turns on screen and sent only the latest question, so
-- every question was answered as if it were the first: "and how much to
-- Bastos?" reached a model that had never heard of Bastos. That is not a chat,
-- it is a search box that answers in sentences.
--
-- Stored per customer, not per session, so it picks up where it left off — the
-- owner's choice. Signed-out visitors are deliberately NOT stored: their
-- follow-ups travel in their own request, because giving a stranger on a
-- landing page a server-side conversation record is a tracking surface, not a
-- feature.
--
-- Trimmed to the last few turns per answer and deleted after 30 days, which the
-- privacy page now states.
CREATE TABLE "AssistantTurn" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantTurn_pkey" PRIMARY KEY ("id")
);

-- Reading a conversation, and pruning by age, are the only two queries.
CREATE INDEX "AssistantTurn_customerId_createdAt_idx" ON "AssistantTurn"("customerId", "createdAt");
CREATE INDEX "AssistantTurn_createdAt_idx" ON "AssistantTurn"("createdAt");

-- Deleting a customer deletes their conversation with us. Nothing about a
-- closed account should outlive it.
ALTER TABLE "AssistantTurn" ADD CONSTRAINT "AssistantTurn_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
