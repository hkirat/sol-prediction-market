use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, MintTo, Burn, Transfer};
pub mod state;
pub mod instructions;
pub mod error;
use instructions::*;
use error::PredictionMarketError;

declare_id!("BQk7tU6iVTW2v8PPSvM2fNVpaNwVRsYtqWuYwWdz18PS");

#[program]
pub mod prediction_market {
    use super::*;

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        market_id: u32,
        settlement_deadline: i64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        
        require!(
            settlement_deadline > Clock::get()?.unix_timestamp,
            PredictionMarketError::InvalidSettlementDeadline
        );
        
        market.authority = ctx.accounts.authority.key();
        market.market_id = market_id;
        market.settlement_deadline = settlement_deadline;
        market.outcome_a_mint = ctx.accounts.outcome_a_mint.key();
        market.outcome_b_mint = ctx.accounts.outcome_b_mint.key();
        market.collateral_mint = ctx.accounts.collateral_mint.key();
        market.collateral_vault = ctx.accounts.collateral_vault.key();
        market.is_settled = false;
        market.winning_outcome = None;
        market.total_collateral_locked = 0;
        market.bump = ctx.bumps.market;
        
        msg!("Market initialized: {}", market.market_id);
        Ok(())
    }

    pub fn split_tokens(
        ctx: Context<SplitToken>,
        market_id: u32,
        amount: u64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        
        require!(!market.is_settled, PredictionMarketError::MarketAlreadySettled);
        require!(
            Clock::get()?.unix_timestamp < market.settlement_deadline,
            PredictionMarketError::MarketExpired
        );
        require!(amount > 0, PredictionMarketError::InvalidAmount);
        
        // Transfer collateral from user to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_collateral.to_account_info(),
                    to: ctx.accounts.collateral_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;
        
        let market_id_bytes = market.market_id.to_le_bytes();
        let seeds = &[
            b"market",
            market_id_bytes.as_ref(),
            &[market.bump],
        ];
        let signer = &[&seeds[..]];
        
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.outcome_a_mint.to_account_info(),
                    to: ctx.accounts.user_outcome_a.to_account_info(),
                    authority: market.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;
        
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.outcome_b_mint.to_account_info(),
                    to: ctx.accounts.user_outcome_b.to_account_info(),
                    authority: market.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;
        
        market.total_collateral_locked = market.total_collateral_locked
            .checked_add(amount)
            .ok_or(PredictionMarketError::MathOverflow)?;
        
        msg!("Minted {} outcome tokens for user", amount);
        Ok(())
    }
}
