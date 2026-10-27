import { Button, Stack, Switch, token } from '@synqapp/ui';
import { styled } from 'styled-components';

import { useAppDispatch, useAppSelector } from '~store';
import {
  setMiniPlayerKeyControlsEnabled,
  setMusicServiceKeyControlsEnabled
} from '~store/slices/settings';
import { sendAnalytic } from '~util/analytics';

import { OptionsSection } from './OptionsSection';

export const KeyControlsSection = () => {
  const miniPlayerControlsEnabled = useAppSelector(
    (state) => state.settings.miniPlayerKeyControlsEnabled
  );
  const musicServiceControlsEnabled = useAppSelector(
    (state) => state.settings.musicServiceKeyControlsEnabled
  );
  const dispatch = useAppDispatch();

  const handleMiniPlayerControlsChange = (value: boolean) => {
    dispatch(setMiniPlayerKeyControlsEnabled(value));
    sendAnalytic({
      name: 'mini_player_key_controls_enabled',
      params: { value }
    });
  };

  const handleMusicServiceControlsChange = (value: boolean) => {
    dispatch(setMusicServiceKeyControlsEnabled(value));
    sendAnalytic({
      name: 'music_service_key_controls_enabled',
      params: { value }
    });
  };

  const handleCustomiseKeyboardShortcuts = () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  };

  return (
    <OptionsSection title="Key controls">
      <Stack direction="column" spacing="sm">
        <Switch
          checked={miniPlayerControlsEnabled}
          onChange={handleMiniPlayerControlsChange}
        >
          Enable mini player key controls
        </Switch>
        <Switch
          checked={musicServiceControlsEnabled}
          onChange={handleMusicServiceControlsChange}
        >
          Enable music service key controls
        </Switch>
        <ButtonContainer>
          <Button
            size="medium"
            rounded
            onClick={handleCustomiseKeyboardShortcuts}
            aria-label="Customise keyboard shortcuts"
          >
            Customise keyboard shortcuts
          </Button>
        </ButtonContainer>
      </Stack>
    </OptionsSection>
  );
};

const ButtonContainer = styled.div`
  margin-top: ${token('spacing.xs')};
`;
