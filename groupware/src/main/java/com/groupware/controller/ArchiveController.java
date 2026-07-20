package com.groupware.controller;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartFile;

import com.groupware.dto.ArchiveDTO;
import com.groupware.dto.ArchiveFileDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.dto.RepositoryDTO;
import com.groupware.service.ArchiveService;
import com.groupware.service.RepositoryService;

import lombok.RequiredArgsConstructor;

@Controller
@RequiredArgsConstructor
public class ArchiveController {

	private final RepositoryService repositoryService;
	private final ArchiveService archiveService;

	// repoId 없이 들어오면(첫 진입) 접근 가능한 자료실 중 첫 번째(전사 공용)로 보여준다.
	// repoId가 있어도 접근 권한이 없으면(다른 부서 자료실 URL 직접 입력 등) 같은 방식으로 대체한다.
	@GetMapping("/archive/list")
	public String archiveList(@ModelAttribute("employee") EmployeeDTO employee,
			@RequestParam(value = "repoId", required = false) Integer repoId,
			@RequestParam(value = "keyword", required = false) String keyword,
			@RequestParam(value = "page", defaultValue = "1") int page, Model model) {
		List<RepositoryDTO> repositories = repositoryService.getAccessibleRepositories(employee);

		int currentRepoId;
		String currentRepoName;
		if (repoId != null && repositoryService.canAccessRepository(employee, repoId)) {
			currentRepoId = repoId;
			currentRepoName = repositories.stream().filter(r -> r.getRepoId() == repoId).findFirst()
					.map(RepositoryDTO::getRepoName).orElse("");
		} else {
			currentRepoId = repositories.get(0).getRepoId();
			currentRepoName = repositories.get(0).getRepoName();
		}

		int totalPages = archiveService.getTotalPages(currentRepoId, keyword);
		model.addAttribute("repositories", repositories);
		model.addAttribute("currentRepoId", currentRepoId);
		model.addAttribute("currentRepoName", currentRepoName);
		model.addAttribute("archives", archiveService.getArchiveList(currentRepoId, keyword, page));
		model.addAttribute("totalPages", totalPages);
		model.addAttribute("currentPage", page);
		model.addAttribute("keyword", keyword);
		model.addAttribute("groupStart", archiveService.getPageGroupStart(page));
		model.addAttribute("groupEnd", archiveService.getPageGroupEnd(page, totalPages));
		return "archive/archive";
	}

	// 자료 작성 - 기획서 3.7 "자료 작성 | 직원 | 필수"라 role 제한은 없지만, 접근 권한 없는
	// 자료실(다른 부서)에 글을 올리지 못하도록 대상 REPO_ID는 반드시 재검증한다.
	@PostMapping("/archive/write")
	@ResponseBody
	public ResponseEntity<String> writeArchive(@ModelAttribute("employee") EmployeeDTO employee,
			@RequestParam("repoId") int repoId, @RequestParam("archiveTitle") String archiveTitle,
			@RequestParam("archiveContent") String archiveContent,
			@RequestParam(value = "files", required = false) List<MultipartFile> files) {
		if (!repositoryService.canAccessRepository(employee, repoId)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).body("접근 권한이 없는 자료실입니다.");
		}
		archiveService.writeArchive(repoId, employee.getEmployeeId(), archiveTitle, archiveContent, files);
		return ResponseEntity.ok("등록되었습니다.");
	}

	// 상세 조회 - 목록 클릭 시 모달이 fetch로 호출하는 JSON API (notice 패턴과 동일).
	// 자료 상세도 "권한 보유자"만 볼 수 있어야 하므로(기획서 3.7), 소속 REPO_ID로 접근 권한을 재검증한다.
	@GetMapping("/archive/detail/{id}")
	@ResponseBody
	public ResponseEntity<ArchiveDTO> archiveDetail(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("id") int id) {
		ArchiveDTO archive = archiveService.getArchiveDetail(id);
		if (archive == null) {
			return ResponseEntity.notFound().build();
		}
		if (!repositoryService.canAccessRepository(employee, archive.getRepoId())) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		return ResponseEntity.ok(archive);
	}

	// 수정 모달 프리필용 - canModifyArchive는 대상 게시글의 WRITER_ID가 있어야 판단 가능하므로 조회를 먼저 함
	@GetMapping("/archive/update/{id}")
	@ResponseBody
	public ResponseEntity<ArchiveDTO> archiveEditForm(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("id") int id) {
		ArchiveDTO archive = archiveService.getArchiveDetail(id);
		if (archive == null) {
			return ResponseEntity.notFound().build();
		}
		if (!archiveService.canModifyArchive(employee, archive)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		return ResponseEntity.ok(archive);
	}

	@PostMapping("/archive/update/{id}")
	@ResponseBody
	public ResponseEntity<String> updateArchive(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("id") int id, @RequestParam("archiveTitle") String archiveTitle,
			@RequestParam("archiveContent") String archiveContent) {
		ArchiveDTO archive = archiveService.getArchiveDetail(id);
		if (archive == null) {
			return ResponseEntity.notFound().build();
		}
		if (!archiveService.canModifyArchive(employee, archive)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).body("본인이 작성한 자료만 수정할 수 있습니다.");
		}
		archiveService.updateArchive(id, archiveTitle, archiveContent);
		return ResponseEntity.ok("수정되었습니다.");
	}

	@PostMapping("/archive/delete/{id}")
	@ResponseBody
	public ResponseEntity<String> deleteArchive(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("id") int id) {
		ArchiveDTO archive = archiveService.getArchiveDetail(id);
		if (archive == null) {
			return ResponseEntity.notFound().build();
		}
		if (!archiveService.canModifyArchive(employee, archive)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).body("본인이 작성한 자료만 삭제할 수 있습니다.");
		}
		archiveService.deleteArchive(id);
		return ResponseEntity.ok("삭제되었습니다.");
	}

	// 다운로드 - 파일이 속한 게시글의 REPO_ID로 접근 권한을 다시 확인한다.
	// (역할구분.md 3-2 5번: "REPO_ID는 게시글 작성 시점 부서로 고정, 작성자가 나중에 부서
	//  이동해도 접근범위 안 바뀌게" - ARCHIVE.REPO_ID를 그대로 기준으로 쓰면 저절로 지켜짐)
	@GetMapping("/archive/download/{fileId}")
	public ResponseEntity<Resource> downloadFile(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("fileId") int fileId) throws IOException {
		ArchiveFileDTO file = archiveService.getArchiveFile(fileId);
		if (file == null) {
			return ResponseEntity.notFound().build();
		}
		ArchiveDTO archive = archiveService.getArchiveDetail(file.getArchiveId());
		if (archive == null || !repositoryService.canAccessRepository(employee, archive.getRepoId())) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}

		Path path = Paths.get(file.getFilePath());
		Resource resource = new FileSystemResource(path);
		if (!resource.exists()) {
			return ResponseEntity.notFound().build();
		}

		// 파일명(FILE_NAME)은 사용자가 올린 원본 한글 이름일 수 있어 URL 인코딩 필요
		// (filename*=UTF-8''... 형식은 RFC 5987 - 한글 등 비ASCII 파일명을 다운로드 대화상자에 그대로 보여줌)
		String encodedName = URLEncoder.encode(file.getFileName(), StandardCharsets.UTF_8).replace("+", "%20");
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodedName)
				.contentType(MediaType.APPLICATION_OCTET_STREAM)
				.body(resource);
	}
}
