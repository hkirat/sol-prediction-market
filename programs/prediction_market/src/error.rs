use anchor_lang::prelude::*;

#[error_code]
pub enum PredictionMarketError {
    #[msg("Invalid settlement deadline")]
    InvalidSettlementDeadline,
}
