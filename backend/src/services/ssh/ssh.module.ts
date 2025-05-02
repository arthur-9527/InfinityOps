import { Module } from '@nestjs/common';
import { SSHServiceImpl } from './sshService';

/**
 * SSH服务模块
 */
@Module({
  providers: [
    {
      provide: 'SSHService',
      useClass: SSHServiceImpl
    }
  ],
  exports: ['SSHService']
})
export class SSHModule {} 