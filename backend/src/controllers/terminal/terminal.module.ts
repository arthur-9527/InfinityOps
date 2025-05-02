import { Module } from '@nestjs/common';
import { TerminalController } from './terminal.controller';
import { SSHModule } from '../../services/ssh';

/**
 * 终端模块
 */
@Module({
  imports: [SSHModule],
  controllers: [TerminalController],
  providers: [],
})
export class TerminalModule {} 