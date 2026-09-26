# Google TV V14

Release branch for TV validation.

Key V14 changes:
- exit confirmation highlight follows captured native TV focus;
- injected quick menu owns deterministic Up/Down/Enter navigation;
- quick VF/VOSTFR mode drives source selection through Nexus VOSTFR / Bravo MULTI pools and quality selection;
- advanced sources opens the original full player settings;
- client VIP UI state is no longer periodically revalidated or revoked through /api/check-vip;
- server authorization headers remain derived only from an existing access_code.
