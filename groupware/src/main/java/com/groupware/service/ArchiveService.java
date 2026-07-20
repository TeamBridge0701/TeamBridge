package com.groupware.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.groupware.dto.ArchiveDTO;
import com.groupware.dto.ArchiveFileDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.mapper.ArchiveFileMapper;
import com.groupware.mapper.ArchiveMapper;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ArchiveService {

	private static final int PAGE_SIZE = 10;
	private static final int PAGE_GROUP_SIZE = 5;

	private final ArchiveMapper archiveMapper;
	private final ArchiveFileMapper archiveFileMapper;

	// 실제 파일이 저장될 폴더 (프로젝트 실행 위치 기준 상대경로 - application.properties 참고)
	@Value("${groupware.archive.upload-dir}")
	private String uploadDir;

	public List<ArchiveDTO> getArchiveList(int repoId, String keyword, int page) {
		int offset = (page - 1) * PAGE_SIZE;
		return archiveMapper.findArchives(repoId, keyword, offset, PAGE_SIZE);
	}

	// 검색 결과가 0건이어도 페이지네이션 UI에 "1페이지"는 표시돼야 하므로 최소 1
	public int getTotalPages(int repoId, String keyword) {
		int totalCount = archiveMapper.countArchives(repoId, keyword);
		return Math.max(1, (int) Math.ceil(totalCount / (double) PAGE_SIZE));
	}

	// NoticeService와 동일한 그룹 페이지네이션 계산 (‹ [그룹시작..그룹끝] ›)
	public int getPageGroupStart(int currentPage) {
		return ((currentPage - 1) / PAGE_GROUP_SIZE) * PAGE_GROUP_SIZE + 1;
	}

	public int getPageGroupEnd(int currentPage, int totalPages) {
		return Math.min(getPageGroupStart(currentPage) + PAGE_GROUP_SIZE - 1, totalPages);
	}

	// 수정/삭제 권한 - 기획서 3.7 "자료 수정·삭제 | 작성자/관리자 | 필수 | 본인 글만"
	// (공지사항의 canModifyNotice와 달리 팀장/부서장 예외가 없음 - 작성 자체가 전 직원에게 열려있어서
	//  "관리자가 아니면 작성자 본인만" 기준 하나로 충분함)
	public boolean canModifyArchive(EmployeeDTO employee, ArchiveDTO archive) {
		if (employee == null || archive == null) {
			return false;
		}
		if ("ADMIN".equals(employee.getEmployeeRole())) {
			return true;
		}
		return employee.getEmployeeId() == archive.getWriterId();
	}

	// 상세 조회 - 게시글 정보 + 첨부파일 목록을 함께 채워서 반환 (수정 모달 프리필도 동일하게 재사용)
	public ArchiveDTO getArchiveDetail(int archiveId) {
		ArchiveDTO archive = archiveMapper.findArchiveDetail(archiveId);
		if (archive == null) {
			return null;
		}
		archive.setFiles(archiveFileMapper.findFilesByArchiveId(archiveId));
		return archive;
	}

	// 다운로드 - 파일 하나만 조회 (소속 REPO_ID 접근 권한 재검증은 Controller에서 getArchiveDetail로 확인)
	public ArchiveFileDTO getArchiveFile(int fileId) {
		return archiveFileMapper.findFileById(fileId);
	}

	// 수정 - 제목/본문만 변경 가능(첨부파일 교체는 범위 밖 - 공지사항과 동일하게 텍스트만)
	public void updateArchive(int archiveId, String archiveTitle, String archiveContent) {
		archiveMapper.updateArchive(archiveId, archiveTitle, archiveContent);
	}

	// 삭제 - ARCHIVE_FILE 행 + 실제 디스크 파일을 먼저 정리한 뒤 ARCHIVE 행을 지운다.
	// 물리 파일 삭제는 DB 트랜잭션 대상이 아니지만, 두 DELETE(ARCHIVE_FILE, ARCHIVE)는 한 트랜잭션으로 묶는다.
	@Transactional
	public void deleteArchive(int archiveId) {
		List<ArchiveFileDTO> files = archiveFileMapper.findFilesByArchiveId(archiveId);
		for (ArchiveFileDTO file : files) {
			try {
				Files.deleteIfExists(Paths.get(file.getFilePath()));
			} catch (IOException e) {
				throw new RuntimeException("파일 삭제에 실패했습니다: " + file.getFileName(), e);
			}
		}
		archiveFileMapper.deleteFilesByArchiveId(archiveId);
		archiveMapper.deleteArchive(archiveId);
	}

	// 게시글 등록 - ARCHIVE 1건 + 첨부파일 개수만큼 ARCHIVE_FILE을 한 트랜잭션으로 저장한다.
	// (파일 저장 중 하나라도 실패하면 ARCHIVE 자체도 롤백 - "글은 저장됐는데 파일은 실패"한 상태 방지)
	// 파일명은 원본 그대로 두면 같은 이름 업로드 시 덮어써질 수 있어, 실제 저장 파일명은
	// UUID로 새로 만들고 원본 이름은 FILE_NAME 컬럼에만 남긴다(다운로드 시 그 이름으로 내려줌).
	@Transactional
	public int writeArchive(int repoId, int writerId, String archiveTitle, String archiveContent,
			List<MultipartFile> files) {
		ArchiveDTO archive = new ArchiveDTO();
		archive.setRepoId(repoId);
		archive.setWriterId(writerId);
		archive.setArchiveTitle(archiveTitle);
		archive.setArchiveContent(archiveContent);
		archiveMapper.insertArchive(archive); // useGeneratedKeys - archive.archiveId가 채워짐

		if (files != null) {
			for (MultipartFile file : files) {
				if (file.isEmpty()) {
					continue;
				}
				saveArchiveFile(archive.getArchiveId(), file);
			}
		}
		return archive.getArchiveId();
	}

	private void saveArchiveFile(int archiveId, MultipartFile file) {
		String originalName = file.getOriginalFilename();
		String ext = "";
		int dotIndex = originalName == null ? -1 : originalName.lastIndexOf('.');
		if (dotIndex >= 0) {
			ext = originalName.substring(dotIndex);
		}
		String storedName = UUID.randomUUID() + ext;
		Path targetPath = Paths.get(uploadDir, storedName);

		try {
			Files.createDirectories(targetPath.getParent());
			file.transferTo(targetPath);
		} catch (IOException e) {
			throw new RuntimeException("파일 저장에 실패했습니다: " + originalName, e);
		}

		ArchiveFileDTO fileDto = new ArchiveFileDTO();
		fileDto.setArchiveId(archiveId);
		fileDto.setFileName(originalName);
		fileDto.setFilePath(targetPath.toString());
		fileDto.setFileSize(file.getSize());
		archiveFileMapper.insertArchiveFile(fileDto);
	}
}
