import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AgentsDefinitionsService } from './agents.definitions';
import { AgentsSkillsService } from './agents.skills';
import { AgentsGuardService } from './agents.guard';
import { CreateToolRuleDto, UpdateToolRuleDto } from './dto/tool-rule.dto';
import { AgentToolRule } from './entities/agent-tool-rule.entity';
import {
  CreateSkillDto,
  SkillResponseDto,
  ToggleSkillDto,
  UpdateSkillDto,
} from './dto/skill.dto';
import {
  AgentDefinitionResponseDto,
  CreateAgentDefinitionDto,
  UpdateAgentDefinitionDto,
} from './dto/agent-definition.dto';

/** Custom agent definitions, skills and tool rules (`agents/definitions`, `agents/skills`, `agents/tool-rules`). */
@ApiTags('Agents')
@Controller('agents')
@UseGuards(AuthGuard)
export class AgentCustomizationController {
  constructor(
    private readonly agentsSkillsService: AgentsSkillsService,
    private readonly agentsDefinitionsService: AgentsDefinitionsService,
    private readonly agentsGuardService: AgentsGuardService,
  ) {}

  // ==========================================
  // Agent Definitions Endpoints
  // ==========================================

  @WorkspaceAccess('agent.read')
  @Get('definitions')
  @Doc({
    operationId: 'AgentsController_getAgentDefinitions',
    summary: 'List agent definitions',
    description:
      "Built-in agents, the workspace's shared agents and the current user's personal agents",
    request: { getWorkspaceId: true },
    response: { serialization: AgentDefinitionResponseDto, isArray: true },
  })
  getAgentDefinitions(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentDefinitionResponseDto[]> {
    return this.agentsDefinitionsService.list(workspaceId, userId);
  }

  @WorkspaceAccess('agent.write')
  @Post('definitions')
  @Doc({
    operationId: 'AgentsController_createAgentDefinition',
    summary: 'Create agent definition',
    description:
      'Create a personal (scope user) or workspace-shared agent. The name is a slug mentioned as @name',
    request: { getWorkspaceId: true },
    response: { serialization: AgentDefinitionResponseDto },
  })
  createAgentDefinition(
    @Body() dto: CreateAgentDefinitionDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentDefinitionResponseDto> {
    return this.agentsDefinitionsService.create(workspaceId, userId, dto);
  }

  @WorkspaceAccess('agent.write')
  @Patch('definitions/:id')
  @Doc({
    operationId: 'AgentsController_updateAgentDefinition',
    summary: 'Update agent definition',
    description: 'Update a custom agent you created',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Agent definition ID' }],
    },
    response: { serialization: AgentDefinitionResponseDto },
  })
  updateAgentDefinition(
    @Param('id') id: string,
    @Body() dto: UpdateAgentDefinitionDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentDefinitionResponseDto> {
    return this.agentsDefinitionsService.update(workspaceId, userId, id, dto);
  }

  @WorkspaceAccess('agent.write')
  @Delete('definitions/:id')
  @Doc({
    operationId: 'AgentsController_deleteAgentDefinition',
    summary: 'Delete agent definition',
    description: 'Delete a custom agent you created',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Agent definition ID' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteAgentDefinition(
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsDefinitionsService.delete(workspaceId, userId, id);
    return { message: 'Agent deleted successfully' };
  }

  // ==========================================
  // Skills Endpoints
  // ==========================================

  @WorkspaceAccess('agent.read')
  @Get('skills')
  @Doc({
    operationId: 'AgentsController_getSkills',
    summary: 'List skills',
    description: 'Get all available skills (builtin + user) for the workspace',
    request: { getWorkspaceId: true },
    response: { serialization: SkillResponseDto, isArray: true },
  })
  getSkills(@WorkspaceId() workspaceId: string): Promise<SkillResponseDto[]> {
    return this.agentsSkillsService.getSkills(workspaceId);
  }

  @WorkspaceAccess('agent.write')
  @Post('skills')
  @Doc({
    operationId: 'AgentsController_createSkill',
    summary: 'Create skill',
    description:
      'Create a new user skill for the workspace (workspace owner only)',
    request: { getWorkspaceId: true },
    response: { serialization: SkillResponseDto },
  })
  async createSkill(
    @Body() dto: CreateSkillDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<SkillResponseDto> {
    return this.agentsSkillsService.createUserSkill(workspaceId, userId, dto);
  }

  @WorkspaceAccess('agent.write')
  @Patch('skills/:id')
  @Doc({
    operationId: 'AgentsController_updateSkill',
    summary: 'Update skill',
    description: 'Update a user skill (workspace owner only)',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Skill ID' }],
    },
    response: { serialization: SkillResponseDto },
  })
  async updateSkill(
    @Param('id') id: string,
    @Body() dto: UpdateSkillDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<SkillResponseDto> {
    return this.agentsSkillsService.updateUserSkill(
      workspaceId,
      id,
      dto,
      userId,
    );
  }

  @WorkspaceAccess('agent.write')
  @Delete('skills/:id')
  @Doc({
    operationId: 'AgentsController_deleteSkill',
    summary: 'Delete skill',
    description: 'Delete a user skill (workspace owner only)',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Skill ID' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteSkill(
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsSkillsService.deleteUserSkill(workspaceId, id, userId);
    return { message: 'Skill deleted successfully' };
  }

  @WorkspaceAccess('agent.write')
  @Patch('skills/:id/toggle')
  @Doc({
    operationId: 'AgentsController_toggleSkill',
    summary: 'Toggle skill',
    description: 'Enable or disable a user skill (workspace owner only)',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Skill ID' }],
    },
    response: { serialization: SkillResponseDto },
  })
  async toggleSkill(
    @Param('id') id: string,
    @Body() dto: ToggleSkillDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<SkillResponseDto> {
    return this.agentsSkillsService.toggleUserSkill(
      workspaceId,
      id,
      dto.isEnabled,
      userId,
    );
  }

  // ==========================================
  // Tool rules (allow / deny / ask before the approval flow)
  // ==========================================

  @WorkspaceAccess('agent.read')
  @Get('tool-rules')
  @Doc({
    operationId: 'AgentsController_getToolRules',
    summary: 'List tool rules',
    description: "The workspace's agent tool rules, highest priority first",
    request: { getWorkspaceId: true },
    response: { serialization: AgentToolRule, isArray: true },
  })
  getToolRules(@WorkspaceId() workspaceId: string): Promise<AgentToolRule[]> {
    return this.agentsGuardService.listRules(workspaceId);
  }

  @WorkspaceAccess('agent.write')
  @Post('tool-rules')
  @Doc({
    operationId: 'AgentsController_createToolRule',
    summary: 'Create tool rule',
    description: 'Add an agent tool rule (workspace owner only)',
    request: { getWorkspaceId: true },
    response: { serialization: AgentToolRule },
  })
  createToolRule(
    @Body() dto: CreateToolRuleDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentToolRule> {
    return this.agentsGuardService.createRule(workspaceId, userId, dto);
  }

  @WorkspaceAccess('agent.write')
  @Patch('tool-rules/:id')
  @Doc({
    operationId: 'AgentsController_updateToolRule',
    summary: 'Update tool rule',
    description: 'Change an agent tool rule (workspace owner only)',
    request: { getWorkspaceId: true, params: [{ name: 'id', description: 'Rule ID' }] },
    response: { serialization: AgentToolRule },
  })
  updateToolRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateToolRuleDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentToolRule> {
    return this.agentsGuardService.updateRule(workspaceId, userId, id, dto);
  }

  @WorkspaceAccess('agent.write')
  @Delete('tool-rules/:id')
  @Doc({
    operationId: 'AgentsController_deleteToolRule',
    summary: 'Delete tool rule',
    description: 'Remove an agent tool rule (workspace owner only)',
    request: { getWorkspaceId: true, params: [{ name: 'id', description: 'Rule ID' }] },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteToolRule(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsGuardService.deleteRule(workspaceId, userId, id);
    return { message: 'Tool rule deleted' };
  }
}
