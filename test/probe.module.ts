import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { AppModule } from '../src/app.module.js';

@Controller('probe')
export class ProbeController {
  @Get()
  @HttpCode(200)
  show() {
    return { ok: true };
  }

  @Post()
  @HttpCode(200)
  create() {
    return { ok: true };
  }

  @Put()
  @HttpCode(200)
  replace() {
    return { ok: true };
  }

  @Patch()
  @HttpCode(200)
  update() {
    return { ok: true };
  }

  @Delete()
  @HttpCode(200)
  remove() {
    return { ok: true };
  }
}

@Module({
  imports: [AppModule],
  controllers: [ProbeController],
})
export class ProbeModule {}
