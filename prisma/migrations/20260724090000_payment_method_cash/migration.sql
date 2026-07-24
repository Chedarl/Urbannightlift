-- Add CASH as a payment method (cash on delivery)
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CASH';
