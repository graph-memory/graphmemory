import { Box, Tooltip, useTheme, keyframes } from '@mui/material';
import { useWsStatus, type WsConnectionStatus } from '@/shared/lib/useWebSocket.ts';

const pulse = keyframes`
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.3); }
  100% { opacity: 1; transform: scale(1); }
`;

const LABELS: Record<WsConnectionStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting\u2026',
  reconnecting: 'Reconnecting\u2026',
  disconnected: 'Disconnected',
};

export function WsStatusIndicator() {
  const status = useWsStatus();
  const { palette } = useTheme();

  const color: Record<WsConnectionStatus, string> = {
    connected: palette.success.main,
    connecting: palette.warning.main,
    reconnecting: palette.warning.main,
    disconnected: palette.error.main,
  };

  const animate = status === 'connecting' || status === 'reconnecting';

  return (
    <Tooltip title={LABELS[status]}>
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          bgcolor: color[status],
          flexShrink: 0,
          ...(animate && {
            animation: `${pulse} 1.5s ease-in-out infinite`,
          }),
        }}
      />
    </Tooltip>
  );
}
