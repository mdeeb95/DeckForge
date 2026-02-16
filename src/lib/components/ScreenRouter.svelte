<script lang="ts">
  import { currentScreen } from '../stores/app';
  import Level1Screen from '../screens/Level1Screen.svelte';
  import Level2Screen from '../screens/Level2Screen.svelte';
  import Level3Screen from '../screens/Level3Screen.svelte';
  import ProjectSelectScreen from '../screens/ProjectSelectScreen.svelte';
  import EmptyStateScreen from '../screens/EmptyStateScreen.svelte';
  import AIWorkingScreen from '../screens/AIWorkingScreen.svelte';
  import QAModeScreen from '../screens/QAModeScreen.svelte';
  import DeployModeScreen from '../screens/DeployModeScreen.svelte';
  import HistoryScreen from '../screens/HistoryScreen.svelte';
  import ExplorationScreen from '../screens/ExplorationScreen.svelte';
  import VoicePitchScreen from '../screens/VoicePitchScreen.svelte';
  import ScreenshotFeedbackScreen from '../screens/ScreenshotFeedbackScreen.svelte';
  import ErrorScreen from '../screens/ErrorScreen.svelte';
</script>

{#key $currentScreen}
<div class="contents screen-fade-in">
{#if $currentScreen === 'level1'}
  <Level1Screen />
{:else if $currentScreen === 'level2'}
  <Level2Screen />
{:else if $currentScreen === 'level3'}
  <Level3Screen />
{:else if $currentScreen === 'project_select'}
  <ProjectSelectScreen />
{:else if $currentScreen === 'empty_state'}
  <EmptyStateScreen />
{:else if $currentScreen === 'ai_working'}
  <AIWorkingScreen />
{:else if $currentScreen === 'qa_mode'}
  <QAModeScreen />
{:else if $currentScreen === 'deploy_mode'}
  <DeployModeScreen />
{:else if $currentScreen === 'history'}
  <HistoryScreen />
{:else if $currentScreen === 'exploration'}
  <ExplorationScreen />
{:else if $currentScreen === 'voice_pitch'}
  <VoicePitchScreen />
{:else if $currentScreen === 'screenshot_feedback'}
  <ScreenshotFeedbackScreen />
{:else if $currentScreen === 'error'}
  <ErrorScreen />
{/if}
</div>
{/key}
