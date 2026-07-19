import { createClient } from '@supabase/supabase-js';
import { rebuildLoanStateFromLedger, calculateTotalDue } from '../domain/finance/calculations';
import { mapLoanFromDB } from '../services/adapters/dbAdapters';

const REAL_URL = 'https://hzchchbxkhryextaymkn.supabase.co';
const REAL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6Y2hjaGJ4a2hyeWV4dGF5bWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTk2ODcsImV4cCI6MjA4MzMzNTY4N30.kX6FlTuPkl7XfycwVuZN2mI6e3ed8NaDUoyAHy9L3nc';

const supabase = createClient(REAL_URL, REAL_KEY);

async function testAllCalculations() {
  console.log("Fetching contracts...");
  const { data: rawLoans, error } = await supabase
    .from('contratos')
    .select('*, parcelas(*), transacoes(*)');

  if (error) {
    console.error("Error fetching contracts:", error);
    return;
  }

  console.log(`Fetched ${rawLoans.length} contracts. Mapping to Loan objects...`);
  
  let nanCount = 0;
  for (const raw of rawLoans) {
    try {
      const loan = rebuildLoanStateFromLedger(mapLoanFromDB(raw));
      for (const inst of loan.installments) {
        const debt = calculateTotalDue(loan, inst);
        
        const hasNaN = Object.entries(debt).some(([key, val]) => typeof val === 'number' && isNaN(val));
        if (hasNaN) {
          nanCount++;
          console.error(`\n[NaN DETECTED] Loan ID: ${loan.id}, BillingCycle: ${loan.billingCycle}, Installment ID: ${inst.id}`);
          console.error("Debt calculation:", debt);
          console.error("Policies:", {
            interestRate: loan.interestRate,
            finePercent: loan.finePercent,
            dailyInterestPercent: loan.dailyInterestPercent
          });
        }
      }
    } catch (e) {
      console.error(`Error processing contract ${raw.id}:`, e);
    }
  }

  console.log(`\nFinished test. Detected ${nanCount} calculations containing NaN.`);
}

testAllCalculations();
