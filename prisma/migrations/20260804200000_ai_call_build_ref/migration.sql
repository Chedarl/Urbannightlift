-- Which build a failure came from.
--
-- The AI panel shows the last few failures, undated, with no idea which
-- deployment produced them. So an error from a bug fixed two deploys ago reads
-- exactly like one happening right now, and the owner has spent three rounds
-- reporting a fixed problem as live. Same defect the maps panel had in v23 and
-- the mail log had in v24: a diagnostic pointing away from the truth.
--
-- Nullable, because rows written before this exists genuinely do not know.
ALTER TABLE "AiCall" ADD COLUMN "buildRef" TEXT;
