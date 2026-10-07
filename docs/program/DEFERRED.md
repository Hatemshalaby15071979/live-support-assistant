# Deferred — do not build

From V2 §7. Touching anything on this list is a Zone R decision.

- Self-serve sign-up and email verification
- Admin console
- Quotas and plan gating
- Alerting stack and dashboards-as-code
- Sandbox billing and any payment code
- Social login
- 5,000-procedure recall **target** (the stress curve is data, not a gate)
- Mobile app

Also deferred, and recorded here rather than in a footnote:

- **Cross-machine determinism.** P2 requires the same seed to give identical decisions on
  one machine. Cross-machine determinism is not claimed unless it is tested.
- **Hosted restore.** P7's backup-restore drill runs against a scratch local PostgreSQL. If a
  hosted restore is needed for a claim, the claim is downgraded to what was executed.

## Why

Each of these is real work that a production SaaS would eventually need. None of them is
evidence that the service **fails safely**, which is the only claim this program is
authorised to prove. Building them now would add surface area without adding proof, and
surface area is what the security case would then have to defend.
